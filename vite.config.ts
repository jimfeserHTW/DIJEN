import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' + hash routing = works from any sub-path (GitHub Pages) and from nginx root.
// cssMinify off: the default minifier drops the unprefixed backdrop-filter, which the glass header needs in Chrome.
export default defineConfig({ base: './', plugins: [react()], build: { cssMinify: false } })
