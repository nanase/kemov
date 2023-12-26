import { type ThemeDefinition } from 'vuetify';
import colors from 'vuetify/lib/util/colors.mjs';

const light: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#F4F5FA',
    primary: colors.indigo.base,
    secondary: colors.indigo.base,
  },
};

const dark: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#121212',
    primary: colors.indigo.lighten4,
    secondary: colors.indigo.darken4,
  },
};

export const theme = {
  themes: {
    defaultTheme: 'light',
    light,
    dark,
  },
  variations: {
    colors: ['primary', 'secondary', 'positive', 'negative'],
    lighten: 0,
    darken: 0,
  },
};
