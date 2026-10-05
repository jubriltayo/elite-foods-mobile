import { Image, StyleSheet, View } from 'react-native';
import type { StyleProp, ImageStyle } from 'react-native';

import { productArtFor } from '../lib/productArt';
import { colors, radii } from '../theme';

interface Props {
  /** The slug the API returns, used to pick a local illustration. */
  slug?: string;
  /** The server's own image. Null today; preferred whenever it is present. */
  imageUrl?: string | null;
  size: number;
  rounded?: number;
  style?: StyleProp<ImageStyle>;
}

/**
 * A product image with a three-step fallback: the server's image, then the local
 * illustration for the slug, then a generic tile. See `lib/productArt`.
 *
 * The illustration carries its own pale ground, so the tile behind it matches and
 * there is no visible seam where the art does not reach the edge.
 */
export function ProductImage({ slug, imageUrl, size, rounded = radii.md, style }: Props) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: rounded }]}>
      <Image
        source={productArtFor(slug, imageUrl)}
        style={style ?? styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
    backgroundColor: colors.cream,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
