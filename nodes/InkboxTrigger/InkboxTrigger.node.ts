import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { IDataObject, IHookFunctions, INodeType, INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class InkboxTrigger implements INodeType {
 description: INodeTypeDescription = {
  displayName:'Inkbox Trigger', name:'inkboxTrigger', icon:{light:'file:../../icons/inkbox-light.svg',dark:'file:../../icons/inkbox.svg'}, group:['trigger'], version:1, subtitle:'={{$parameter.identityId}}',
  description:'Start a workflow when an Inkbox email or text arrives', defaults:{name:'Inkbox Trigger'}, inputs:[], outputs:[NodeConnectionTypes.Main],
  credentials:[{name:'inkboxApi',required:true}], webhooks:[{name:'default',httpMethod:'POST',responseMode:'onReceived',path:'webhook'}],
  properties:[{displayName:'Agent Identity ID',name:'identityId',type:'string',required:true,default:'',description:'UUID of the identity that owns the mailbox and phone number'},
   {displayName:'Signing Key',name:'signingKey',type:'string',typeOptions:{password:true},default:'',description:'Existing identity signing key, required if one has already been created. The first subscription can provision one automatically.'},
   {displayName:'Events',name:'events',type:'multiOptions',required:true,options:[{name:'Email Received',value:'message.received'},{name:'Text Received',value:'text.received'}],default:['message.received','text.received']}],
 };
 webhookMethods = { default: {
  async checkExists(this:IHookFunctions):Promise<boolean> { const data=this.getWorkflowStaticData('node'); return typeof data.subscriptionId === 'string' && typeof data.authToken === 'string' && typeof data.signingKey === 'string'; },
  // https://inkbox.ai/docs/api/webhooks/subscriptions
  async create(this:IHookFunctions):Promise<boolean> {
   const data=this.getWorkflowStaticData('node'); const events=this.getNodeParameter('events') as string[]; const identity=this.getNodeParameter('identityId') as string;
   if (!events.length) throw new NodeOperationError(this.getNode(),'Select at least one event');
   const url=this.getNodeWebhookUrl('default'); if (!url || !url.startsWith('https://')) throw new NodeOperationError(this.getNode(),'Inkbox requires a public HTTPS webhook URL');
   const token=randomBytes(32).toString('hex');
   const result=await this.helpers.httpRequestWithAuthentication.call(this,'inkboxApi',{method:'POST',url:'https://inkbox.ai/api/v1/webhooks/subscriptions',json:true,body:{agent_identity_id:identity,url,event_types:events,auth_token:token}}) as IDataObject;
   if (typeof result.id !== 'string') throw new NodeOperationError(this.getNode(),'Inkbox did not return a subscription ID');
   // Use the one-time key Inkbox returns for a keyless identity, otherwise the key the user entered.
   // No fallback to previously stored static data: delete() clears the secret on deactivation.
   const supplied = this.getNodeParameter('signingKey', '') as string; const signingKey = typeof result.signing_key === 'string' && result.signing_key ? result.signing_key : supplied;
   if (typeof signingKey !== 'string' || !signingKey) {
    await this.helpers.httpRequestWithAuthentication.call(this,'inkboxApi',{method:'DELETE',url:	`https://inkbox.ai/api/v1/webhooks/subscriptions/${encodeURIComponent(result.id)}`,qs:{scope:'identity'},json:true});
    throw new NodeOperationError(this.getNode(),'Identity already has a signing key. Enter the existing key in Signing Key and activate again.',{description:'If you no longer have the key, rotate it in the Inkbox Console or with POST /identities/{agent_handle}/signing-key, then paste the new key here. Rotating replaces the key for every receiver of this identity.'});
   }
   data.subscriptionId=result.id; data.authToken=token; data.signingKey=signingKey; return true;
  },
  async delete(this:IHookFunctions):Promise<boolean> {
   const data=this.getWorkflowStaticData('node'); if (!data.subscriptionId) return true;
   await this.helpers.httpRequestWithAuthentication.call(this,'inkboxApi',{method:'DELETE',url:`https://inkbox.ai/api/v1/webhooks/subscriptions/${encodeURIComponent(String(data.subscriptionId))}`,qs:{scope:'identity'},json:true});
   // Remove every secret this trigger stored, including the signing key, when the workflow is deactivated.
   delete data.subscriptionId; delete data.authToken; delete data.signingKey; return true;
  },
 } };
 async webhook(this:IWebhookFunctions):Promise<IWebhookResponseData> {
  const token=this.getWorkflowStaticData('node').authToken;
  const header=this.getHeaderData().authorization;
  const expected=Buffer.from(`Bearer ${typeof token === 'string' ? token : ''}`); const actual=Buffer.from(typeof header === 'string' ? header : '');
  if (typeof token !== 'string' || !token || actual.length !== expected.length || !timingSafeEqual(actual,expected)) return {webhookResponse:{status:401,body:'Unauthorized'}};
  const headers=this.getHeaderData(); const requestId=headers['x-inkbox-request-id']; const timestamp=headers['x-inkbox-timestamp']; const signature=headers['x-inkbox-signature'];
  const signingKey=this.getWorkflowStaticData('node').signingKey; const raw=this.getRequestObject().rawBody;
  if (typeof signingKey !== 'string' || !signingKey || typeof requestId !== 'string' || !requestId || typeof timestamp !== 'string' || !/^\d+$/.test(timestamp) || Math.abs(Date.now()/1000-Number(timestamp)) > 300 || typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(signature) || !Buffer.isBuffer(raw)) return {webhookResponse:{status:401,body:'Unauthorized'}};
  const digest=createHmac('sha256',signingKey).update(requestId+'.'+timestamp+'.').update(raw).digest(); const provided=Buffer.from(signature.slice(7),'hex');
  if (!timingSafeEqual(digest,provided)) return {webhookResponse:{status:401,body:'Unauthorized'}};
  return {workflowData:[this.helpers.returnJsonArray(this.getBodyData())]};
 }
}
