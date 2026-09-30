import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-paper p-4 text-center">
      <h1 className="text-xl font-semibold text-ink">Сторінку не знайдено</h1>
      <Link href="/" className="font-medium text-brass-2 underline underline-offset-4 hover:text-brass">
        На головну
      </Link>
    </div>
  );
}
