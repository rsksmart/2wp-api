export class RskBlock {
  readonly height: number;
  readonly hash: string;
  readonly parentHash: string;

  constructor(height: number, hash: string, parentHash: string) {
    this.height = height;
    this.hash = hash;
    this.parentHash = parentHash;
  }

  public toString(): string {
    return `{hash:${this.hash}, parentHash:${this.parentHash}, height:${this.height}}`;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static fromWeb3Block(data: any): RskBlock {
    return new RskBlock(data.number, data.hash, data.parentHash);
  }
}
