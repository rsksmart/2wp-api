import { SearchableModel } from "./rsk/searchable-model";
import { model, property} from '@loopback/repository';

export interface FeaturesDataModel {
    creationDate: Date;
    lastUpdateDate: Date;
    name: string;
    value: string;
    version: number;
}
  
export class FeaturesAppDataModel implements FeaturesDataModel{
  constructor(data?: Partial<FeaturesAppDataModel>) {
    Object.assign(this, data);
  }

  creationDate: Date;
  lastUpdateDate: Date;
  name: string;
  value: string;
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
    type: 'string',
  })
  value: string;

  @property({
    type: 'number',
  })
  version: number;

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
    features.value = other.value;
    features.version = other.version;
    return features;
  }

}
 