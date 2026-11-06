import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { WorkbenchStateSchema, type WorkbenchState } from '../../apps/web/src/state.js';

// Synthetic database/transport fixtures. No provider, live Switch or physical performance.
async function snapshot(request: APIRequestContext) {
  return WorkbenchStateSchema.parse(await (await request.get('/api/state')).json());
}
async function open(page: Page, state: WorkbenchState) {
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/studio');
}

test('room makes the recorded writer-engineer handoff inspectable without inventing a repair', async ({page, request}) => {
  const state = await snapshot(request);
  const mutations: string[] = [];
  page.on('request', r => { if (!['GET','HEAD'].includes(r.method())) mutations.push(r.url()); });
  await open(page,state);
  await expect(page.getByText('Writer asked for a staging review', {exact:true})).toBeVisible();
  await expect(page.getByText('Performer account sent the scene brief', {exact:true})).toBeVisible();
  const activity = page.getByRole('region',{name:'Switch activity'});
  await expect(activity).toBeVisible();
  await expect(activity.getByText('Stage engineer requested a repair',{exact:true})).toHaveCount(0);
  const receipt = activity.getByText('View Switch receipt',{exact:true}).first();
  await receipt.click();
  await expect(activity).toContainText(state.collaboration.events[0]!.messageId!);
  expect(mutations).toEqual([]);
});

test('room keeps pending, uncertain and withdrawn messages distinct', async({page, request}) => {
  const state=await snapshot(request);
  state.collaboration.events = ['pending','uncertain','withdrawn'].map((status,index)=>({
    id:`synthetic-${index}`, actor:'writer', to:'stage', kind:'review_request', title:`Synthetic ${status} request`,
    text:'Synthetic staging review handoff.', status:status as 'pending'|'uncertain'|'withdrawn', timestamp:null,messageId:null,taskId:`task-${index}`,revisionId:null,
  }));
  await open(page,state);
  for(const event of state.collaboration.events) await expect(page.getByText(event.title,{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Switch activity'})).not.toContainText('just now');
});

test('room is readable on mobile with keyboard and reduced motion', async({page,request},info) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await open(page,await snapshot(request));
  await expect(page.getByRole('region',{name:'Switch activity'})).toBeVisible();
  const receipt=page.getByText('View Switch receipt',{exact:true}).first();
  await receipt.focus();await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('collaboration-mobile.png'),fullPage:true});
});

test('unavailable room shows recovery without synthetic fallback', async({page}) => {
  await page.route('**/api/state',route=>route.fulfill({status:503,json:{error:'synthetic outage'}}));
  await page.goto('/studio');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('region',{name:'Switch activity'}).getByText('Writer asked for a staging review')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/retry/i})).toBeVisible();
});

test('draft review and Switch recovery remain explicit before approval', async({page,request})=>{
 const state=await snapshot(request);state.proposals[0]!.status='pending_review';state.current=null;state.currentDigest=null;state.artifacts=[];state.approvals=[];state.connection={status:'blocked',detail:'Synthetic replay gap requires reconciliation.'};
 await open(page,state);await expect(page.getByText('Waiting for staging review.',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toContainText('Synthetic replay gap');await expect(page.getByText('Draft · unapproved',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Open the cues & script'})).toHaveCount(0);await page.getByRole('button',{name:'Preview the draft'}).click();await page.getByRole('button',{name:'Back to collaboration room'}).click();await expect(page.getByRole('region',{name:'Switch activity'})).toBeVisible();
});
test('unconfirmed feedback leads to Record before any choice of repairs',async({page,request})=>{
 const state=await snapshot(request);state.approvalHold=true;state.needsRepair=true;state.observations=[{id:'synthetic-pending',revisionId:state.current!.id,text:'Synthetic difficulty.',interpretation:'Synthetic unconfirmed interpretation.',status:'awaiting_confirmation'}];
 await open(page,state);await expect(page.getByText('Confirm what needs to change.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Review the options'})).toHaveCount(0);await page.getByRole('button',{name:'Review the record'}).click();await expect(page.getByRole('tab',{name:'Record',exact:true})).toHaveAttribute('aria-selected','true');
});
test('room keyboard cannot start hidden playback and missing history does not request another brief',async({page,request})=>{
 const state=await snapshot(request);state.collaboration.events=[];await open(page,state);await expect(page.getByText('No saved Switch receipts available.',{exact:true})).toBeVisible();await page.locator('body').click({position:{x:2,y:2}});await page.keyboard.press('Space');await page.waitForTimeout(1100);await page.getByRole('button',{name:'The scene ↗',exact:true}).click();await expect(page.getByRole('button',{name:'Start timed cues',exact:true})).toBeVisible();
});

test('public example is explicitly synthetic and independent of the live API',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/example');
 await expect(page.getByRole('note')).toContainText('Synthetic example');
 await expect(page.getByRole('region',{name:'Switch activity'})).toContainText('Stage engineer requested a repair');
 await expect(page.getByRole('button',{name:'Review the options'})).toBeVisible();
 await page.getByRole('button',{name:'Your files ↗',exact:true}).click();
 await expect(page.getByRole('link',{name:'Offline cue player',exact:false})).toHaveAttribute('href',/^\/examples\/artifacts\//);
 expect(requests.some(url=>url.includes('/api/state'))).toBe(false);
 expect(requests.some(url=>url.includes('collaboration-state.json'))).toBe(true);
});
