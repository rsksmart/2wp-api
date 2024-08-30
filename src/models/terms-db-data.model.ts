import { model, property} from '@loopback/repository';
import { SearchableModel } from "./rsk/searchable-model";

@model()
export class TermsDbDataModel implements SearchableModel {

  @property({
    type: 'number',
    required: true,
  })
  version: number;

  @property({
    type: 'string',
    required: true,
  })
  value: string;


  constructor(data?: Partial<TermsDbDataModel>) {
    Object.assign(this, data);;
  }

  getId() {
    return this.version;
  }
  // eslint-disable-next-line class-methods-use-this
  getIdFieldName(): string {
    return "version";
  }
}
