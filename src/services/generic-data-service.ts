import {SearchableModel} from '../models/rsk/searchable-model';

export interface GenericDataService<Type extends SearchableModel> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getById(id: any): Promise<Type>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMany(query?: any): Promise<Array<Type>>;
  set(data: Type): Promise<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete(id: any): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
