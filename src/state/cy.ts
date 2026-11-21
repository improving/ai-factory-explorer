import type cytoscape from 'cytoscape'
import { create } from 'zustand'

// The one Cytoscape instance of the canvas, for the minimap (null before the canvas mounts).
export const useCy = create<{ cy: cytoscape.Core | null }>()(() => ({ cy: null }))
