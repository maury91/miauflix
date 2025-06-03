export const scaleImage = (url?: string, width = 780) =>
  url?.replace('/original/', `/w${width}/`) ?? '';
