interface Segment {
  text: string
  hl?: string
}

export interface RenderResult {
  lines: string[]
  highlights: { line: number; hlGroup: string; colStart: number; colEnd: number }[]
}

function byteLen(s: string): number {
  return Buffer.from(s).length
}

export class LineBuffer {
  private lines: Segment[][] = [[]]
  private li = 0
  private patternHls: { line: number; hlGroup: string; colStart: number; colEnd: number }[] = []

  append(text: string, hl?: string) {
    this.lines[this.li].push({ text, hl })
    return this
  }

  nl(text?: string, hl?: string) {
    if (text !== undefined) this.append(text, hl)
    this.li++
    this.lines[this.li] = []
    return this
  }

  lineCount(): number {
    return this.lines.length
  }

  highlight(pattern: RegExp, hlGroup: string) {
    const segs = this.lines[this.li]
    let full = ''
    for (const seg of segs) full += seg.text

    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(full)) !== null) {
      const colStart = byteLen(full.slice(0, m.index))
      const colEnd = colStart + byteLen(m[0])
      this.patternHls.push({ line: this.li, hlGroup, colStart, colEnd })
    }

    return this
  }

  render(): RenderResult {
    const lines: string[] = []
    const highlights: RenderResult['highlights'] = []

    for (let li = 0; li < this.lines.length; li++) {
      const segs = this.lines[li]
      let full = ''

      for (const seg of segs) {
        const colStart = byteLen(full)
        full += seg.text
        const colEnd = byteLen(full)
        if (seg.hl) {
          highlights.push({ line: li, hlGroup: seg.hl, colStart, colEnd })
        }
      }

      lines.push(full)
    }

    for (const h of this.patternHls) {
      highlights.push(h)
    }
    this.patternHls = []

    return { lines, highlights }
  }
}
