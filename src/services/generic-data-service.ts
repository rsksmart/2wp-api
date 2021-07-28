import {SearchableModel} from '../models/rsk/searchable-model';

export interface GenericDataService<Type extends SearchableModel> {
  getById(id: any): Promise<Type>;
  getMany(query?: any): Promise<Array<Type>>;
  set(data: Type): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
