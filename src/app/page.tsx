import Link from 'next/link';

export default function Home() {
  const apps = [
    {
      name: 'AI Gateway',
      slug: '/apps/ai',
      description: '飞书 AI 机器人，接入 Claude 大模型',
    },
    {
      name: 'Blog',
      slug: '/apps/blog',
      description: '博客（待开发）',
    },
  ];

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-2xl px-8 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Apps
        </h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
          我的应用合集
        </p>
        <ul className="mt-8 space-y-4">
          {apps.map((app) => (
            <li key={app.slug}>
              <Link
                href={app.slug}
                className="block rounded-lg border border-zinc-200 p-6 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <h2 className="text-xl font-medium text-black dark:text-zinc-50">
                  {app.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {app.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
