import {Model, model, property} from '@loopback/repository';
import {ALLOWED_FIREBLOCKS_URIS} from '../constants/fireblocks-allowed-uris';

@model()
export class FireblocksGenericRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  apiKey: string;

  @property({
    type: 'string',
    required: true,
  })
  jwt: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
        // Reject URIs containing "@" to prevent SSRF attacks
        // Reject query parameters and fragments (? and #)
        // Path traversal (../) is already prevented by the character class not including "."
        // Hyphen at end of character class to avoid range interpretation
        enum: ALLOWED_FIREBLOCKS_URIS,
        pattern: '^(?!.*[@?#])\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$',
        errorMessage: 'URI must be a valid Fireblocks API endpoint and not contain invalid characters',
      },
  })
  uri: string;

  @property({
    type: 'object',
    required: false,
  })
  bodyData?: object;

  constructor(data?: Partial<FireblocksGenericRequest>) {
    super(data);
  }
}
