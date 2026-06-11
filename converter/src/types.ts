import { Project, SourceFile } from 'ts-morph'

export interface TransformContext {
  file: SourceFile
  project: Project
}

export type Transform = (ctx: TransformContext) => void
