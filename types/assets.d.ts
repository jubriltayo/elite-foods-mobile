/**
 * Ambient types for assets imported as modules.
 *
 * Metro resolves a `require('./x.png')` to an asset reference at build time, but
 * TypeScript needs to be told what that value is. Every image in the app is a
 * plain local PNG, which is what keeps the illustrations free of any renderer.
 */

declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const asset: ImageSourcePropType;
  export default asset;
}
