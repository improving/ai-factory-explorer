// The slug of a heading, in the shape of the anchors that the documents already use: lower case, and
// everything that is not a letter or a digit becomes one dash.
//
// The build (content/rewrite.ts) and the renderer (docs/render.ts) share this function, and an anchor that
// a document cites passes through it too, so the two sides of a link always agree.

export function slugify(text: string): string {
  const plain = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // a link: its text
    .replace(/<[^>]*>/g, '') // a tag of the rendered HTML
    .replace(/[*_`~]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return plain === '' ? 'section' : plain
}

// The words of a heading, without the inline markup: the table of contents and a search result use it.
export const headingText = (text: string): string => text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '')
