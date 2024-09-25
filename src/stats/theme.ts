import { type ThemeDefinition } from 'vuetify';
import colors from 'vuetify/lib/util/colors.mjs';

const light: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#F4F5FA',
    primary: colors.indigo.base,
    secondary: colors.indigo.base,
    positive: colors.green.darken3,
    negative: colors.red.darken3,
    //
    v2DrawerBackground: '#ffffff',
    v2DrawerList: '#3c3c43',
    v2DrawerListActive: colors.indigo.base,
    v2AppBarBackground: '#ffffff',
    v2SnackbarBackground: '#171717',
  },

  variables: {
    'high-emphasis-opacity': '1.0',
    'v2-content-color': '#3c3c43',
    'v2-snackbar-border': 'none',
  },
};

const dark: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#121212',
    primary: colors.indigo.lighten4,
    secondary: colors.indigo.darken4,
    positive: colors.green.lighten2,
    negative: colors.red.lighten1,
    //
    v2DrawerBackground: '#171717',
    v2DrawerList: '#bcbcbc',
    v2DrawerListActive: colors.blue.lighten2,
    v2AppBarBackground: '#171717',
    v2SnackbarBackground: '#171717',
  },
  variables: {
    'high-emphasis-opacity': '0.86',
    'v2-content-color': 'rgba(255, 255, 245, .86)',
    'v2-snackbar-border': '1px solid #3c3c43',
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
