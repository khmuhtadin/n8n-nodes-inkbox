import type { IAuthenticateGeneric, Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class InkboxApi implements ICredentialType {
 name = 'inkboxApi';
 displayName = 'Inkbox API';
 icon: Icon = {light:'file:../icons/inkbox.svg',dark:'file:../icons/inkbox.svg'};
 documentationUrl = 'https://inkbox.ai/docs/api/mail';
 properties: INodeProperties[] = [{ displayName: 'API Key', name: 'apiKey', type: 'string', typeOptions: { password: true }, default: '', required: true }];
 authenticate: IAuthenticateGeneric = { type: 'generic', properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } } };
 // Authenticated GET https://inkbox.ai/docs/api/mail/mailboxes
 test: ICredentialTestRequest = { request: { baseURL: 'https://inkbox.ai/api/v1', url: '/mail/mailboxes', method: 'GET' } };
}
