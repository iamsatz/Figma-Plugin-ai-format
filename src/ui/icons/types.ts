export type IconLibrary = 'phosphor' | 'lucide' | 'heroicons' | 'material';

export type LibrarySuggestion = { kind: 'library'; library: IconLibrary; name: string };
export type CustomSuggestion = { kind: 'custom'; name: string; svg: string };

export type IconSuggestion = LibrarySuggestion | CustomSuggestion;

export function suggestionId(s: IconSuggestion): string {
  return s.kind === 'library' ? `${s.library}:${s.name}` : `custom:${s.name}`;
}
