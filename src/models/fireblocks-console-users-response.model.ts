import {Model, model, property} from '@loopback/repository';

@model()
export class FireblocksConsoleUser extends Model {
  @property({
    type: 'string',
    required: true,
  })
  id: string;

  @property({
    type: 'string',
    required: true,
  })
  name: string;

  @property({
    type: 'string',
    required: true,
  })
  role: string;

  @property({
    type: 'boolean',
    required: true,
  })
  enabled: boolean;

  @property({
    type: 'string',
    required: true,
  })
  status: string;

  @property({
    type: 'string',
    required: true,
  })
  userType: string;

  constructor(data?: Partial<FireblocksConsoleUser>) {
    super(data);
  }
}

@model()
export class FireblocksConsoleUsersResponse extends Model {
  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  users: FireblocksConsoleUser[];

  @property({
    type: 'string',
    required: false,
  })
  error?: string;

  constructor(data?: Partial<FireblocksConsoleUsersResponse>) {
    super(data);
  }
}

export type FireblocksConsoleUsersResponseWithRelations = FireblocksConsoleUsersResponse; 