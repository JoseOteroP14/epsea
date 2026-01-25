import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Guideline sizes are based on standard ~400dp width mobile screens (iPhone 11-15, etc.)
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

/**
 * Scales a size based on screen width.
 */
const widthPercent = (widthPercent: number | string) => {
    const elemWidth = typeof widthPercent === "number" ? widthPercent : parseFloat(widthPercent);
    return PixelRatio.roundToNearestPixel(SCREEN_WIDTH * elemWidth / 100);
};

/**
 * Scales a size based on screen height.
 */
const heightPercent = (heightPercent: number | string) => {
    const elemHeight = typeof heightPercent === "number" ? heightPercent : parseFloat(heightPercent);
    return PixelRatio.roundToNearestPixel(SCREEN_HEIGHT * elemHeight / 100);
};

/**
 * Horizontal scaling helper.
 */
const widthScale = (size: number) => (SCREEN_WIDTH / guidelineBaseWidth) * size;

/**
 * Vertical scaling helper.
 */
const verticalScale = (size: number) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;

/**
 * Moderate scaling helper – useful for responsiveness that shouldn't grow too much.
 */
const moderateScale = (size: number, factor = 0.5) => size + (widthScale(size) - size) * factor;

/**
 * Responsive font size helper.
 */
const responsiveFont = (size: number) => {
    const newSize = size * (SCREEN_WIDTH / guidelineBaseWidth);
    if (Platform.OS === 'ios') {
        return Math.round(PixelRatio.roundToNearestPixel(newSize));
    } else {
        return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
    }
};

export { heightPercent, moderateScale, responsiveFont, SCREEN_HEIGHT, SCREEN_WIDTH, verticalScale, widthPercent, widthScale };

