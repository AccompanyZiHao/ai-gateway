import Link from 'next/link';

export default function AiAdminPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-6 text-center">
        <Link
          href="/apps/ai"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; AI Gateway
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Admin
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          管理后台（待开发）
        </p>
      </main>
    </div>
  );
}
