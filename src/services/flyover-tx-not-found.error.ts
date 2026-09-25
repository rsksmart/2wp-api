export class FlyoverTxNotFoundError extends Error {
  constructor() {
    super('Flyover tx not found');
    this.name = 'FlyoverTxNotFoundError';
  }
}
