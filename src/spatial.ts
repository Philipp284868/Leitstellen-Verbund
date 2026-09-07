export class SpatialIndex<T extends { x: number; y: number }> {
  private cells = new Map<string, T[]>();
  constructor(private size = 64) {}
  add(p: T) {
    const k = `${Math.floor(p.x / this.size)}:${Math.floor(p.y / this.size)}`;
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k)!.push(p);
  }
  query(x: number, y: number, width: number, height: number) {
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      width < 0 ||
      height < 0
    )
      return [];
    const result: T[] = [];
    for (
      let a = Math.floor(x / this.size);
      a <= Math.floor((x + width) / this.size);
      a++
    )
      for (
        let b = Math.floor(y / this.size);
        b <= Math.floor((y + height) / this.size);
        b++
      )
        for (const p of this.cells.get(`${a}:${b}`) ?? [])
          if (p.x >= x && p.y >= y && p.x <= x + width && p.y <= y + height)
            result.push(p);
    return result;
  }
}
