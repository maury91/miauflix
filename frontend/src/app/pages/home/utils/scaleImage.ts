export const scaleImage = (url?: string | null, width = 780) =>
  url?.replace('/original/', `/w${width}/`) ?? '';
