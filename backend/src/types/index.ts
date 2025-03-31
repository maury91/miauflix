export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
}

export type Response<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
