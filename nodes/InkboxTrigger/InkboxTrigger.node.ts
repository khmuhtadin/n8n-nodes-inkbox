import { randomBytes, timingSafeEqual } from 'crypto';
import type { IDataObject, IHookFunctions, INodeType, INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class InkboxTrigger implements INodeType {
 description: INodeTypeDescription = {
  displayName:'Inkbox Trigger', name:'inkboxTrigger', icon:{light:'file:../../icons/inkbox.svg',dark:'file:../../icons/inkbox.svg'}, group:['trigger'], version:1, subtitle:'={{$parameter.identityId}}',
  description:'Start a workflow when an Inkbox email or text arrives', defaults:{name:'Inkbox Trigger'}, inputs:[], outputs:[NodeConnectionTypes.Main],
  credentials:[{name:'inkboxApi',required:true}], webhooks:[{name:'default',httpMethod:'POST',responseMode:'onReceived',path:'webhook'}],
  properties:[{displayName:'Agent Identity ID',name:'identityId',type:'string',required:true,default:'',description:'UUID of the identity that owns the mailbox and phone number'},
   {displayName:'Events',name:'events',type:'multiOptions',required:true,options:[{name:'Email Received',value:'message.received'},{name:'Text Received',value:'text.received'}],default:['message.received','text.received']}],
 };
 webhookMethods = { default: {
  async checkExists(this:IHookFunctions):Promise<boolean> { const data=this.getWorkflowStaticData('node'); return typeof data.subscriptionId === 'string' && typeof data.authToken === 'string'; },
  // https://inkbox.ai/docs/api/webhooks/subscriptions
  async create(this:IHookFunctions):Promise<boolean> {
   const data=this.getWorkflowStaticData('node'); const events=this.getNodeParameter('events') as string[]; const identity=this.getNodeParameter('identityId') as string;
   if (!events.length) throw new NodeOperationError(this.getNode(),'Select at least one event');
   const url=this.getNodeWebhookUrl('default'); if (!url || !url.startsWith('https://')) throw new NodeOperationError(this.getNode(),'Inkbox requires a public HTTPS webhook URL');
   const token=randomBytes(32).toString('hex');
   const result=await this.helpers.httpRequestWithAuthentication.call(this,'inkboxApi',{method:'POST',url:'https://inkbox.ai/api/v1/webhooks/subscriptions',json:true,body:{agent_identity_id:identity,url,event_types:events,auth_token:token}}) as IDataObject;
   if (typeof result.id !== 'string') throw new NodeOperationError(this.getNode(),'Inkbox did not return a subscription ID');
   data.subscriptionId=result.id; data.authToken=token; if (typeof result.signing_key === 'string') data.signingKey=result.signing_key; return true;
  },
  async delete(this:IHookFunctions):Promise<boolean> {
   const data=this.getWorkflowStaticData('node'); if (!data.subscriptionId) return true;
   await this.helpers.httpRequestWithAuthentication.call(this,'inkboxApi',{method:'DELETE',url:`https://inkbox.ai/api/v1/webhooks/subscriptions/${encodeURIComponent(String(data.subscriptionId))}`,qs:{scope:'identity'},json:true});
   delete data.subscriptionId; delete data.authToken; return true;
  },
 } };
 async webhook(this:IWebhookFunctions):Promise<IWebhookResponseData> {
  const token=this.getWorkflowStaticData('node').authToken;
  const header=this.getHeaderData().authorization;
  const expected=Buffer.from(`Bearer ${typeof token === 'string' ? token : ''}`); const actual=Buffer.from(typeof header === 'string' ? header : '');
  if (typeof token !== 'string' || !token || actual.length !== expected.length || !timingSafeEqual(actual,expected)) return {webhookResponse:{status:401,body:'Unauthorized'}};
  return {workflowData:[this.helpers.returnJsonArray(this.getBodyData())]};
 }
}
