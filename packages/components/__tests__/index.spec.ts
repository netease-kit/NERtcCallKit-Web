import { add, greet } from '../src';

describe('@yunxin-sdk-component/components module', () => {
  it('should add', () => {
    expect(add(2, 3)).toEqual(5);
  });
  it('should greet', () => {
    expect(greet('world')).toEqual('@yunxin-sdk-component/components says: hello to world');
  });
});
