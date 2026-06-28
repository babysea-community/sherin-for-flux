import {
  ExternalLink,
  GitCompareArrows,
  Github,
  HeartHandshake,
  KeyRound,
  Rocket,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

import { ClientGallery } from '@/components/gallery/client';
import { ProtectedImage } from '@/components/protected-image';

const repositoryUrl = 'https://github.com/babysea-community/sherin-for-flux';
const templatesUrl = 'https://babysea.ai/templates/sherin-for-flux';

const communityLinks = [
  {
    href: repositoryUrl,
    label: 'Source code',
    description: 'Sherin project code, issues, releases, and docs.',
    Icon: Github,
  },
  {
    href: `${repositoryUrl}/blob/main/CODE_OF_CONDUCT.md`,
    label: 'Code of Conduct',
    description: 'Community standards for issues, pull requests, and support.',
    Icon: HeartHandshake,
  },
  {
    href: `${repositoryUrl}/blob/main/LICENSE`,
    label: 'License',
    description: 'OSI-approved Apache-2.0 License for reuse and forks.',
    Icon: Scale,
  },
] as const;

const shipCta =
  'Sherin runs on your own inference API key, your own domain, and your own storage. There is no paid plan inside Sherin.';

const pageContainerClass = 'mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10';

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <section
        className={`${pageContainerClass} relative flex min-h-screen flex-col py-8`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.22),transparent_38rem),radial-gradient(circle_at_top_right,rgba(45,212,191,0.16),transparent_32rem)]"
        />

        <nav className="flex items-center justify-between gap-4 text-sm">
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-3 font-semibold text-white transition hover:text-fuchsia-100"
          >
            <ProtectedImage
              src="/icon.png"
              alt="Sherin"
              width={36}
              height={36}
              className="size-9 rounded-xl"
              decoding="async"
              fetchPriority="high"
              loading="eager"
            />
            <span>Sherin</span>
          </a>
          <Link
            href="/access"
            className="inline-flex items-center gap-2 rounded-full bg-fuchsia-300 px-4 py-2 font-semibold text-slate-950 shadow-lg shadow-[#4a044e66] transition hover:bg-fuchsia-200"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            Owner access
          </Link>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(26rem,1.12fr)] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#f0abfc33] bg-[#f0abfc1a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-100">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Self-hosted private workspace
            </p>

            <h1 className="mt-7 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Own key. Own domain. Own storage.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Sherin is a self-hosted private workspace for generative media,
              built for creators, artists, and developers who want more
              ownership over their creative workflow.
            </p>

            <div className="mt-10 flex flex-row flex-nowrap items-center gap-2 sm:gap-3">
              <a
                href={repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-fuchsia-300 px-4 py-3 text-xs font-semibold text-slate-950 shadow-lg shadow-[#4a044e66] transition hover:bg-fuchsia-200 sm:px-6 sm:text-sm"
              >
                <Github className="size-4" aria-hidden="true" />
                View source
              </a>
              <a
                href={templatesUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#f0abfc66] px-4 py-3 text-xs font-semibold text-fuchsia-100 transition hover:bg-[#f0abfc1a] sm:px-6 sm:text-sm"
              >
                See templates
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#20263a] bg-[#070b1a] p-5">
            <div className="rounded-[1.4rem] border border-[#20263a] bg-[#050817] p-5">
              <div className="flex items-center justify-between gap-3 border-b border-[#20263a] pb-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Project surface
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Source, conduct, license, and community links
                  </p>
                </div>
                <GitCompareArrows
                  className="size-5 text-fuchsia-200"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-5 grid gap-3">
                {communityLinks.map((item) => {
                  const Icon = item.Icon;

                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-2xl border border-[#20263a] bg-[#0a0f22] p-4 hover:border-[#f0abfc] hover:bg-[#111833]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#25163f] text-fuchsia-100">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-semibold text-white">
                            {item.label}
                            <ExternalLink
                              className="size-3.5 text-slate-500"
                              aria-hidden="true"
                            />
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-slate-400">
                            {item.description}
                          </span>
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#20263a] bg-[#000416]">
        <div className={`${pageContainerClass} py-28 sm:py-36`}>
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-14 text-center sm:gap-16 lg:gap-20">
            <p className="max-w-4xl text-xl font-semibold leading-8 tracking-tight text-white sm:text-2xl sm:leading-9 lg:text-3xl lg:leading-10">
              {shipCta}
            </p>
            <a
              href={repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full bg-fuchsia-300 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-[#4a044e66] transition hover:bg-fuchsia-200"
            >
              <Rocket className="size-4" aria-hidden="true" />
              Ship your own Sherin
            </a>
            <ProtectedImage
              src="/dashboard.png"
              alt="Sherin dashboard"
              width={1000}
              height={525}
              decoding="async"
              loading="lazy"
              sizes="(min-width: 1280px) 72rem, calc(100vw - 3rem)"
              className="w-full rounded-2xl border border-[#20263a] shadow-2xl shadow-[#00000066]"
            />
          </div>
        </div>
      </section>

      <ClientGallery />

      <footer
        className={`${pageContainerClass} flex flex-col gap-3 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between`}
      >
        <a
          href="https://babysea.ai/about"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-[#05BDBA] underline decoration-[#05BDBA66] underline-offset-4 transition hover:text-white hover:decoration-white"
        >
          Built for the AI community
        </a>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={`${repositoryUrl}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-fuchsia-100 transition hover:text-white"
          >
            Apache-2.0 License
          </a>
          <a
            href={`${repositoryUrl}/blob/main/CODE_OF_CONDUCT.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-fuchsia-100 transition hover:text-white"
          >
            Code of Conduct
          </a>
        </div>
      </footer>
    </main>
  );
}
