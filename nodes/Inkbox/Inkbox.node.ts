import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, INodeExecutionData, INodeProperties, INodeType, INodeTypeDescription, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const show = (resource: string[], operation?: string[]) => ({ show: { resource, ...(operation ? { operation } : {}) } });
const field = (displayName: string, name: string, resource: string[], operation?: string[], required = true): INodeProperties => ({ displayName, name, type: 'string', default: '', required, displayOptions: show(resource, operation) });
const props: INodeProperties[] = [
 { displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true, options: [{ name: 'Identity', value: 'identity' }, { name: 'Mail', value: 'mail' }, { name: 'Mailbox', value: 'mailbox' }, { name: 'Phone Number', value: 'phoneNumber' }, { name: 'SMS', value: 'sms' }], default: 'mail' },
 ...(['identity','mailbox','phoneNumber'] as const).map((r): INodeProperties => ({ displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, displayOptions: show([r]), options: [{ name: 'Get Many', value: 'getMany', action: `Get many ${r === 'phoneNumber' ? 'phone numbers' : r === 'identity' ? 'identities' : 'mailboxes'}` }], default: 'getMany' })),
 { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, displayOptions: show(['mail']), options: [{ name: 'Get', value: 'get', action: 'Get a mail message' }, { name: 'Get Many', value: 'getMany', action: 'Get many mail messages' }, { name: 'Send', value: 'send', action: 'Send an email' }], default: 'getMany' },
 { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, displayOptions: show(['sms']), options: [{ name: 'Get Many', value: 'getMany', action: 'Get many texts' }, { name: 'Send', value: 'send', action: 'Send a text' }], default: 'getMany' },
 field('Mailbox Email Address','mailboxEmail',['mail']), field('Message ID','messageId',['mail'],['get']), field('Phone Number ID','phoneNumberId',['sms']),
 field('To','to',['mail','sms'],['send']), field('Subject','subject',['mail'],['send']), field('Text','text',['mail','sms'],['send']),
 { displayName: 'Additional Fields', name: 'additionalFields', type: 'collection', placeholder: 'Add Field', default: {}, displayOptions: show(['mail'],['send']), options: [
  { displayName: 'BCC', name: 'bcc', type: 'string', default: '', description: 'Comma-separated email addresses' },
  { displayName: 'CC', name: 'cc', type: 'string', default: '', description: 'Comma-separated email addresses' },
  { displayName: 'HTML Body', name: 'bodyHtml', type: 'string', default: '' },
  { displayName: 'In Reply To Message ID', name: 'inReplyTo', type: 'string', default: '', description: 'RFC 5322 Message-ID, not the Inkbox record ID' },
 ] },
 { displayName: 'Idempotency Key', name: 'idempotencyKey', type: 'string', default: '', displayOptions: show(['mail','sms'],['send']), description: 'Optional stable key to protect against duplicate sends when retrying' },
 { displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false, displayOptions: show(['mail','sms'],['getMany']), description: 'Whether to return all results or only up to a given limit' },
 { displayName: 'Limit', name: 'limit', type: 'number', typeOptions: { minValue: 1 }, default: 50, displayOptions: { show: { resource: ['mail','sms'], operation: ['getMany'], returnAll: [false] } }, description: 'Max number of results to return' },
];
const split = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);
export class Inkbox implements INodeType {
 description: INodeTypeDescription = { displayName: 'Inkbox', name: 'inkbox', icon: { light:'file:../../icons/inkbox-light.svg', dark: 'file:../../icons/inkbox.svg' }, group: ['transform'], version: 1, subtitle: '={{$parameter.operation}}', description: 'Read and send email and SMS with Inkbox', defaults: { name: 'Inkbox' }, inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main], usableAsTool: true, credentials: [{ name: 'inkboxApi', required: true }], properties: props };
 // Programmatic pagination is needed because mail uses cursors while SMS uses offsets.
 async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const out: INodeExecutionData[] = [];
  for (let i=0;i<this.getInputData().length;i++) {
   try {
    const r = this.getNodeParameter('resource',i) as string, op = this.getNodeParameter('operation',i) as string;
    let path = '', method: 'GET'|'POST' = 'GET', body: IDataObject | undefined;
    // https://inkbox.ai/docs/api/identities (GET /identities)
    if (r === 'identity' && op === 'getMany') path = '/identities';
    // https://inkbox.ai/docs/api/mail/mailboxes (GET /mail/mailboxes)
    else if (r === 'mailbox' && op === 'getMany') path = '/mail/mailboxes';
    // https://inkbox.ai/docs/api/phone/numbers (GET /phone/numbers)
    else if (r === 'phoneNumber' && op === 'getMany') path = '/phone/numbers';
    // https://inkbox.ai/docs/api/mail/messages (GET list/get and POST send)
    else if (r === 'mail' && ['getMany','get','send'].includes(op)) {
     path = `/mail/mailboxes/${encodeURIComponent(this.getNodeParameter('mailboxEmail',i) as string)}/messages`;
     if (op === 'get') path += `/${encodeURIComponent(this.getNodeParameter('messageId',i) as string)}`;
     if (op === 'send') {
      method = 'POST'; const a = this.getNodeParameter('additionalFields',i,{}) as IDataObject;
      const recipients: IDataObject = { to: split(this.getNodeParameter('to',i) as string) };
      if (a.cc) recipients.cc = split(String(a.cc)); if (a.bcc) recipients.bcc = split(String(a.bcc));
      body = { recipients, subject: this.getNodeParameter('subject',i), body_text: this.getNodeParameter('text',i) };
      if (a.bodyHtml) body.body_html = a.bodyHtml; if (a.inReplyTo) body.in_reply_to_message_id = a.inReplyTo;
     }
    }
    // https://inkbox.ai/docs/api/phone/texts (GET list and POST send)
    else if (r === 'sms' && ['getMany','send'].includes(op)) {
     path = `/phone/numbers/${encodeURIComponent(this.getNodeParameter('phoneNumberId',i) as string)}/texts`;
     if (op === 'send') { method = 'POST'; body = { to: this.getNodeParameter('to',i), text: this.getNodeParameter('text',i) }; }
    } else throw new NodeOperationError(this.getNode(), `Unsupported operation: ${r}/${op}`, { itemIndex:i });
    const request = async (qs?: IDataObject): Promise<unknown> => {
     const opt: IHttpRequestOptions = { method, url: `https://inkbox.ai/api/v1${path}`, json: true };
     if (body) opt.body = body; if (qs) opt.qs = qs;
     if (method === 'POST') { const key = this.getNodeParameter('idempotencyKey',i,'') as string; if (key) opt.headers = { 'Idempotency-Key': key, Prefer: 'idempotency-replay' }; }
     try { return await this.helpers.httpRequestWithAuthentication.call(this,'inkboxApi',opt); }
     catch (e) { throw new NodeApiError(this.getNode(), e as JsonObject, { itemIndex:i }); }
    };
    let rows: IDataObject[] = [];
    if (op === 'getMany' && (r === 'mail' || r === 'sms')) {
     const all = this.getNodeParameter('returnAll',i,false) as boolean; const limit = all ? Infinity : this.getNodeParameter('limit',i,50) as number;
     if (!Number.isInteger(limit) && limit !== Infinity || limit < 1) throw new NodeOperationError(this.getNode(),'Limit must be a positive integer',{itemIndex:i});
     let cursor: string | undefined, offset = 0; const seen = new Set<string>();
     while (rows.length < limit) {
      const size = Math.min(r === 'mail' ? 100 : 200, limit-rows.length);
      const qs: IDataObject = { limit: size }; if (r === 'mail' && cursor) qs.cursor = cursor; if (r === 'sms') qs.offset = offset;
      const response = await request(qs); const page = r === 'mail' ? ((response as IDataObject).items as IDataObject[]) : response as IDataObject[];
      if (!Array.isArray(page)) throw new NodeOperationError(this.getNode(),'Unexpected list response',{itemIndex:i});
      rows.push(...page); if (!page.length) break;
      if (r === 'mail') { const next = (response as IDataObject).next_cursor; if (typeof next !== 'string' || !next) break; if (seen.has(next)) throw new NodeOperationError(this.getNode(),'Repeated pagination cursor',{itemIndex:i}); seen.add(next); cursor = next; }
      else { offset += page.length; if (page.length < size) break; }
     } rows = rows.slice(0, limit);
    } else { const result = await request(); rows = Array.isArray(result) ? result as IDataObject[] : [result as IDataObject]; }
    for (const json of rows) out.push({json,pairedItem:{item:i}});
   } catch(e) { if (this.continueOnFail()) { out.push({json:{error:(e as Error).message},pairedItem:{item:i}}); continue; } throw e instanceof NodeApiError || e instanceof NodeOperationError ? e : new NodeOperationError(this.getNode(), e as Error, {itemIndex:i}); }
  } return [out];
 }
}
