import { model, property} from '@loopback/repository';
import { SearchableModel } from "./rsk/searchable-model";

export interface FeaturesDataModel {
    creationDate: Date;
    lastUpdateDate: Date;
    name: string;
    enabled: boolean;
    version: number;
}
  
export class FeaturesAppDataModel implements FeaturesDataModel{
  constructor(data?: Partial<FeaturesAppDataModel>) {
    Object.assign(this, data);
  }

  creationDate: Date;
  lastUpdateDate: Date;
  name: string;
  enabled: boolean;
  version: number;
}

@model({settings: {strict: false}})
export class FeaturesDbDataModel implements SearchableModel, FeaturesDataModel {

  @property({
    type: 'date',
    defaultFn: 'now'
  })
  creationDate: Date;

  @property({
    type: 'date',
    defaultFn: 'now'
  })
  lastUpdateDate: Date;

  @property({
    type: 'string',
  })
  name: string;

  @property({
    type: 'boolean',
  })
  enabled: boolean;

  @property({
    type: 'number',
  })
  version: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  getId() {
    return this.name;
  }
  getIdFieldName(): string {
    return 'name';
  }

  public static clone(other: FeaturesDbDataModel): FeaturesDbDataModel {
    const features: FeaturesDbDataModel = new FeaturesDbDataModel();
    features.creationDate = other.creationDate;
    features.lastUpdateDate = other.lastUpdateDate;
    features.name = other.name;
    features.enabled = other.enabled;
    features.version = other.version;
    return features;
  }

}
 