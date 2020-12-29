import { add, greet } from '../src';

describe('@yunxin-sdk-component/apis module', () => {
  it('should add', () => {
    expect(add(2, 3)).toEqual(5);
  });
  it('should greet', () => {
    expect(greet('world')).toEqual('@yunxin-sdk-component/apis says: hello to world');
  });
});
