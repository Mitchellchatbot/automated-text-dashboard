"use client";

import { useState } from "react";
import { RevealScope } from "@/components/motion/RevealScope";
import { Counter } from "@/components/motion/Counter";
import { AlumniDetailModal } from "@/components/alumni/AlumniDetailModal";
import { cardActivate } from "@/lib/cardActivate";
import type { AlumniDetail } from "@/lib/types";

export type ClientLite = { id: string; name: string; sf: string; days: string; date: string; detail: AlumniDetail };
export type GroupLite = { group: string; clients: ClientLite[] };
export type ReachedLite = ClientLite & { group: string; daysAgo: number };

export interface DueTodayData {
  todayLabel: string;
  totalDue: number;
  reachedCount: number;
  totalAlumni: number;
  activeMilestones: number;
  groups: GroupLite[];
  reached: ReachedLite[];
  windowDays: number;
}

const CHEV = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6l4 4 4-4" />
  </svg>
);

const slug = (g: string) => g.replace(/\s+/g, "-");
const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};
const mIndex = (g: string) => (g === "Post 90" ? "90+" : g.replace("Day ", ""));

function Header({ todayLabel }: { todayLabel: string }) {
  return (
    <div className="hero" style={{ marginBottom: 24 }}>
      <p className="eyebrow">Follow-up care · {todayLabel}</p>
    </div>
  );
}

function ClientCard({ c, onOpen }: { c: ClientLite; onOpen: (a: AlumniDetail) => void }) {
  return (
    <div
      className="ccard clickable"
      aria-label={`View details for ${c.name}`}
      {...cardActivate(() => onOpen(c.detail))}
    >
      <div className="rec-mono" aria-hidden="true">{initials(c.name)}</div>
      <div className="cbody">
        <div className="ctop">
          <span className="cname">{c.name}</span>
          <span className="csf mono">{c.sf}</span>
        </div>
        <div className="cmeta">
          <span className="num">{c.days}</span> since discharge · Discharged {c.date}
        </div>
      </div>
    </div>
  );
}

export function DueTodayView(data: DueTodayData) {
  const { todayLabel, totalDue, reachedCount, totalAlumni, activeMilestones, groups, reached, windowDays } = data;

  const [selected, setSelected] = useState<AlumniDetail | null>(null);

  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    groups.forEach((g) => {
      if (g.clients.length && g.group !== "Post 90") s.add(g.group);
    });
    return s;
  });
  const toggle = (g: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  const jump = (g: string) => {
    setOpen((prev) => new Set(prev).add(g));
    const el = document.getElementById(`msec-${slug(g)}`);
    if (el) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  const nonEmpty = groups.filter((g) => g.clients.length > 0);

  /* ---- fully empty (current reality: no discharged leads) ---- */
  if (totalAlumni === 0) {
    return (
      <RevealScope>
        <Header todayLabel={todayLabel} />
        <div className="soft-card" style={{ padding: 0 }}>
          <div className="empty">
            <div className="halo" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-6.5-4.2-6.5-9A3.7 3.7 0 0 1 12 8.6 3.7 3.7 0 0 1 18.5 12c0 4.8-6.5 9-6.5 9z" />
              </svg>
            </div>
            <p className="et">No alumni yet</p>
            <p className="es">Discharged clients appear here automatically after the daily Salesforce sync runs.</p>
          </div>
        </div>
      </RevealScope>
    );
  }

  const reachedList = (
    <div data-reveal>
      <div className="subhead">
        <h2>Reached in the last {windowDays} days</h2>
        <span className="note">a gentle catch-up — may already be handled</span>
      </div>
      <div className="soft-card">
        <ul className="fu">
          {reached.length === 0 ? (
            <li>
              <div className="furow">
                <span className="fu-name" style={{ color: "var(--muted)" }}>
                  No milestones came due in the last {windowDays} days.
                </span>
              </div>
            </li>
          ) : (
            reached.map((r) => (
              <li key={r.id}>
                <div
                  className="furow clickable"
                  aria-label={`View details for ${r.name}`}
                  {...cardActivate(() => setSelected(r.detail))}
                >
                  <div className="fu-main">
                    <span className="fu-name">{r.name}</span>
                    <span className="fu-sf mono">{r.sf}</span>
                  </div>
                  <div className="fu-meta">
                    <span className="chip">{r.group} · {r.daysAgo}d ago</span>
                    <span className="num">{r.days} since discharge</span>
                    <span className="fu-sep">·</span>
                    <span className="fu-date">Discharged {r.date}</span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );

  return (
    <RevealScope>
      <div className="hero">
        <p className="eyebrow">Follow-up care · {todayLabel}</p>
        <div className="hero-grid">
          <div className="starborder" data-reveal data-reveal-delay="0">
            <div className="sb-inner">
              <div className="stat-hero">
                <span className="today-pill">Today</span>
                <Counter to={totalDue} className="big num" />
                <span className="headline">
                  {totalDue === 0 ? "no follow-ups due today" : "clients require follow-up today"}
                </span>
                <span className="hsub">
                  {totalDue === 0
                    ? "you're all caught up · America/New York"
                    : `across ${activeMilestones} milestone${activeMilestones === 1 ? "" : "s"} · America/New York`}
                </span>
              </div>
            </div>
          </div>
          <div className="stat-mini-col">
            <div className="stat-mini" data-reveal data-reveal-delay="80">
              <Counter to={reachedCount} className="n num" />
              <span className="l">reached in the last {windowDays} days</span>
            </div>
            <div className="stat-mini" data-reveal data-reveal-delay="150">
              <Counter to={totalAlumni} className="n num" />
              <span className="l">alumni in aftercare</span>
            </div>
          </div>
        </div>

        <div className="timeline" role="list" aria-label="Milestones">
          {groups.map((g, i) => {
            const due = g.clients.length > 0;
            return (
              <button
                key={g.group}
                className={`marker${due ? " due" : ""}`}
                data-reveal
                data-reveal-delay={i * 28}
                onClick={() => due && jump(g.group)}
                aria-disabled={due ? undefined : true}
                type="button"
              >
                <span className="dot" />
                <span className="m-label">{g.group}</span>
                <span className="m-count num">{g.clients.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {nonEmpty.length === 0 ? (
        <div className="soft-card" style={{ padding: 0 }} data-reveal>
          <div className="empty">
            <div className="halo" aria-hidden="true">🎉</div>
            <p className="et">You&rsquo;re all caught up</p>
            <p className="es">No clients hit a follow-up milestone today. Check back tomorrow.</p>
          </div>
        </div>
      ) : (
        <div className="milestones">
          {nonEmpty.map((g, i) => {
            const isOpen = open.has(g.group);
            return (
              <section
                key={g.group}
                className="msec"
                id={`msec-${slug(g.group)}`}
                data-open={isOpen}
                data-reveal
                data-reveal-delay={i * 34}
              >
                <button className="mhead" aria-expanded={isOpen} onClick={() => toggle(g.group)} type="button">
                  <span className="m-index">{mIndex(g.group)}</span>
                  <span className="mtitlewrap">
                    <span className="m-title">{g.group}</span>
                    <span className="m-sub">{mIndex(g.group)} days since discharge</span>
                  </span>
                  <span className="m-count-chip num">{g.clients.length}</span>
                  <span className="mline" />
                  <span className="chev" aria-hidden="true">{CHEV}</span>
                </button>
                <div className="msec-body">
                  <div className="msec-inner">
                    <div className="client-grid">
                      {g.clients.map((c) => (
                        <ClientCard key={c.id} c={c} onOpen={setSelected} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="section-gap" />
      {reachedList}

      <AlumniDetailModal alumni={selected} onClose={() => setSelected(null)} />
    </RevealScope>
  );
}
