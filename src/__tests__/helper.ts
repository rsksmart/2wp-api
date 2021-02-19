import {PeginConfiguration} from '../models';

export function givenPeginConfiguration(
  peginConfiguration?: Partial<PeginConfiguration>,
) {
  const data = Object.assign(
    {
      sessionId: 'test_id',
    },
    peginConfiguration,
  );
  return new PeginConfiguration(data);
}
