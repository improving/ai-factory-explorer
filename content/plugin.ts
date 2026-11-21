// The plugin that reads the operator documents from the repository at build time.
//
// It emits one virtual module, `virtual:docs`, with the rewritten Markdown and the headings of each
// document. There is no generated file to commit and to forget: a build and a dev-server start read the
// files from disk, and a change to a file of the set reloads the module.

import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { DOCS, type DocEntry } from './docs.ts'
import { rewrite, type Heading } from './rewrite.ts'

export const DOCS_ID = 'virtual:docs'
const RESOLVED = `\0${DOCS_ID}`

export type Doc = DocEntry & { markdown: string; headings: Heading[] }

// The documents of the set, rewritten. Throws on a path that is not in the repository: a build must not
// ship a portal with a document that it does not have.
export function loadDocs(root: string): Doc[] {
  return DOCS.map((entry) => {
    const file = resolve(root, entry.path)
    let text: string
    try {
      statSync(file)
      text = readFileSync(file, 'utf8')
    } catch {
      throw new Error(`${entry.path} is in content/docs.ts and not in the repository`)
    }
    const { markdown, headings } = rewrite(entry, text)
    return { ...entry, markdown, headings }
  })
}

const moduleOf = (docs: Doc[]): string =>
  `export const DOCS = ${JSON.stringify(docs)}\n` + `export const BYTES = ${JSON.stringify(docs.reduce((n, d) => n + d.markdown.length, 0))}\n`

export function docsPlugin(root: string): Plugin {
  const files = new Set(DOCS.map((d) => resolve(root, d.path)))
  return {
    name: 'ai-factory-explorer-docs',
    resolveId: (id) => (id === DOCS_ID ? RESOLVED : null),
    load: (id) => {
      if (id !== RESOLVED) return null
      const docs = loadDocs(root)
      const bytes = docs.reduce((n, d) => n + d.markdown.length, 0)
      console.log(`docs: ${docs.length} documents, ${Math.round(bytes / 1024)} KB of Markdown`)
      return moduleOf(docs)
    },
    // A change to a document of the set reloads the module, so a dev server shows the edit.
    // A document is not in the module graph (the plugin reads it from disk), so the watcher needs the files.
    configureServer(server) {
      const reload = (file: string) => {
        if (!files.has(file)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.add([...files])
      server.watcher.on('change', reload)
      server.watcher.on('add', reload)
      server.watcher.on('unlink', reload)
    },
    handleHotUpdate({ file, server }) {
      if (!files.has(file)) return
      const mod = server.moduleGraph.getModuleById(RESOLVED)
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
