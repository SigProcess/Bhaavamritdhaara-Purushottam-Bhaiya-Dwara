import type { GeneratedBuildMetadata } from './browserAdapters'

declare const __BHAAVAMRIT_BUILD_METADATA__: GeneratedBuildMetadata

/** Vite replaces this constant for production builds. */
export const generatedBuildMetadata: GeneratedBuildMetadata =
  typeof __BHAAVAMRIT_BUILD_METADATA__ === 'undefined'
    ? { releaseVersion: 'development' }
    : __BHAAVAMRIT_BUILD_METADATA__
