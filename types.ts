
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface StoryState {
  image: string | null;
  analysis: string;
  paragraph: string;
  isLoading: boolean;
  error: string | null;
}
