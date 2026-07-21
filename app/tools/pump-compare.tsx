import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Dimensions } from "react-native";
import Svg, { Polyline, Line, Text as SvgText, Circle, Rect, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { subDays, format, eachDayOfInterval, startOfDay } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { useUnit } from "../../hooks/useUnit";
import { ozToMl } from "../../lib/units";
import { COLORS, SERIF } from "../../lib/constants";

// ── Constants ─────────────────────────────────────────────────────────────────

const PUMP_COLORS = [
  COLORS.primary,   // teal
  "#E8854A",        // orange
  "#6B9E78",        // sage green
  "#B07D9A",        // mauve
  "#7A9BB0",        // slate blue
  "#C4A35A",        // gold
  "#9B7A7A",        // dusty rose
  "#7A9B7A",        // moss
];
const TOTAL_COLOR  = "#2E3F40";
const DAYS_WINDOW  = 28;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionRow {
  pump_name: string | null;
  total_oz: number | null;
  started_at: string;
  suction_level: number | null;
  pump_mode: string | null;
}

interface DailyPoint {
  date: string;   // "YYYY-MM-DD"
  oz: number;
}

interface PumpSeries {
  name: string;
  color: string;
  avgOz: number;
  totalSessions: number;
  points: DailyPoint[];  // one entry per day in the window (0 if no session)
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function buildSeries(rows: SessionRow[], days: string[]): { series: PumpSeries[]; totalPoints: DailyPoint[] } {
  // Group rows by pump name
  const byPump = new Map<string, SessionRow[]>();
  for (const row of rows) {
    if (!row.pump_name) continue;
    if (!byPump.has(row.pump_name)) byPump.set(row.pump_name, []);
    byPump.get(row.pump_name)!.push(row);
  }

  // Daily totals per pump
  const series: PumpSeries[] = [];
  let colorIdx = 0;
  for (const [name, sessions] of byPump.entries()) {
    const dailyMap = new Map<string, number>();
    for (const s of sessions) {
      const d = s.started_at.slice(0, 10);
      dailyMap.set(d, (dailyMap.get(d) ?? 0) + (s.total_oz ?? 0));
    }
    const points = days.map((d) => ({ date: d, oz: dailyMap.get(d) ?? 0 }));
    const activeDays = points.filter((p) => p.oz > 0);
    const avgOz = activeDays.length > 0
      ? activeDays.reduce((s, p) => s + p.oz, 0) / activeDays.length
      : 0;

    series.push({
      name,
      color: PUMP_COLORS[colorIdx % PUMP_COLORS.length],
      avgOz,
      totalSessions: sessions.length,
      points,
    });
    colorIdx++;
  }

  // Sort by avg desc (best pump first = first color)
  series.sort((a, b) => b.avgOz - a.avgOz);
  series.forEach((s, i) => { s.color = PUMP_COLORS[i % PUMP_COLORS.length]; });

  // All-pump daily totals
  const allDailyMap = new Map<string, number>();
  for (const row of rows) {
    const d = row.started_at.slice(0, 10);
    allDailyMap.set(d, (allDailyMap.get(d) ?? 0) + (row.total_oz ?? 0));
  }
  const totalPoints = days.map((d) => ({ date: d, oz: allDailyMap.get(d) ?? 0 }));

  return { series, totalPoints };
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────

const CHART_H     = 200;
const PAD_LEFT    = 36;
const PAD_RIGHT   = 12;
const PAD_TOP     = 12;
const PAD_BOTTOM  = 28;

function LineChart({
  series,
  totalPoints,
  days,
  width,
  unit,
  showTotal,
}: {
  series: PumpSeries[];
  totalPoints: DailyPoint[];
  days: string[];
  width: number;
  unit: "oz" | "ml";
  showTotal: boolean;
}) {
  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const n     = days.length;

  const convert = (oz: number) => unit === "ml" ? Math.round(ozToMl(oz) * 10) / 10 : oz;

  // Find y-max across all visible series + total
  const allValues = [
    ...series.flatMap((s) => s.points.map((p) => convert(p.oz))),
    ...(showTotal ? totalPoints.map((p) => convert(p.oz)) : []),
  ].filter((v) => v > 0);
  const yMax = allValues.length > 0 ? Math.ceil(Math.max(...allValues) * 1.15) : (unit === "ml" ? 300 : 10);

  const xPos = (i: number) => PAD_LEFT + (i / Math.max(n - 1, 1)) * plotW;
  const yPos = (val: number) => PAD_TOP + plotH - (val / yMax) * plotH;

  const pointsStr = (pts: DailyPoint[]) =>
    pts
      .map((p, i) => `${xPos(i)},${yPos(convert(p.oz))}`)
      .join(" ");

  // X-axis label indices — show ~5 evenly spaced
  const labelIndices = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];

  // Y-axis grid lines
  const gridValues = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax];

  return (
    <Svg width={width} height={CHART_H}>
      {/* Grid lines */}
      {gridValues.map((v) => (
        <Line
          key={`grid-${v}`}
          x1={PAD_LEFT} y1={yPos(v)}
          x2={width - PAD_RIGHT} y2={yPos(v)}
          stroke="rgba(0,0,0,0.06)" strokeWidth={1}
        />
      ))}

      {/* Y-axis labels */}
      {gridValues.filter((v) => v > 0).map((v) => (
        <SvgText
          key={`ylabel-${v}`}
          x={PAD_LEFT - 4} y={yPos(v) + 4}
          fontSize={9} fill={COLORS.ink3} textAnchor="end"
        >
          {v}
        </SvgText>
      ))}

      {/* X-axis labels */}
      {labelIndices.map((i) => (
        <SvgText
          key={`xlabel-${i}`}
          x={xPos(i)} y={CHART_H - 4}
          fontSize={9} fill={COLORS.ink3} textAnchor="middle"
        >
          {format(new Date(days[i] + "T12:00:00"), "M/d")}
        </SvgText>
      ))}

      {/* Total line (dashed via short segments) */}
      {showTotal && totalPoints.map((p, i) => {
        if (i === 0) return null;
        const prev = totalPoints[i - 1];
        return (
          <Line
            key={`total-seg-${i}`}
            x1={xPos(i - 1)} y1={yPos(convert(prev.oz))}
            x2={xPos(i)} y2={yPos(convert(p.oz))}
            stroke={TOTAL_COLOR} strokeWidth={2}
            strokeDasharray="4,3"
            opacity={0.45}
          />
        );
      })}

      {/* Pump lines */}
      {series.map((s) => (
        <Polyline
          key={s.name}
          points={pointsStr(s.points)}
          fill="none"
          stroke={s.color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Dots on last data point per pump */}
      {series.map((s) => {
        const lastIdx = [...s.points].reverse().findIndex((p) => p.oz > 0);
        if (lastIdx === -1) return null;
        const realIdx = s.points.length - 1 - lastIdx;
        return (
          <Circle
            key={`dot-${s.name}`}
            cx={xPos(realIdx)}
            cy={yPos(convert(s.points[realIdx].oz))}
            r={4}
            fill={s.color}
            stroke="#fff"
            strokeWidth={1.5}
          />
        );
      })}
    </Svg>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({
  series,
  totalPoints,
  showTotal,
  onToggleTotal,
  unit,
}: {
  series: PumpSeries[];
  totalPoints: DailyPoint[];
  showTotal: boolean;
  onToggleTotal: () => void;
  unit: "oz" | "ml";
}) {
  const convert = (oz: number) => unit === "ml" ? ozToMl(oz) : oz;
  const fmt = (oz: number) => unit === "ml" ? `${Math.round(convert(oz))} ml` : `${oz.toFixed(1)} oz`;

  return (
    <View style={{ paddingHorizontal: 4, gap: 8 }}>
      {series.map((s, i) => (
        <View key={s.name} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 24, height: 3, backgroundColor: s.color, borderRadius: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
              {i === 0 ? "🏆 " : ""}{s.name}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
            {fmt(s.avgOz)} avg · {s.totalSessions} sessions
          </Text>
        </View>
      ))}

      {/* Total toggle */}
      {series.length > 0 && <View style={{ height: 1, backgroundColor: COLORS.border }} />}
      <Pressable
        onPress={onToggleTotal}
        style={{
          flexDirection: "row", alignItems: "center", gap: 10,
          backgroundColor: showTotal ? "rgba(74,94,96,0.06)" : "transparent",
          borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8,
        }}
      >
        <View style={{ width: 24, height: 0, borderTopWidth: 2, borderTopColor: TOTAL_COLOR, borderStyle: "dashed", opacity: showTotal ? 1 : 0.4 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: showTotal ? COLORS.ink : COLORS.ink3 }}>
            Total (all pumps)
          </Text>
          <Text style={{ fontSize: 11, color: COLORS.ink3 }}>Dashed line · combined daily output</Text>
        </View>
        <Text style={{ fontSize: 11, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.primary }}>
          {showTotal ? "Hide" : "Show"}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PumpCompareScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { unit } = useUnit();
  const screenW = Dimensions.get("window").width;

  const [loading,    setLoading]    = useState(true);
  const [series,     setSeries]     = useState<PumpSeries[]>([]);
  const [totalPts,   setTotalPts]   = useState<DailyPoint[]>([]);
  const [days,       setDays]       = useState<string[]>([]);
  const [showTotal,     setShowTotal]     = useState(true);
  const [noData,        setNoData]        = useState(false);
  const [allRows,       setAllRows]       = useState<SessionRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const since = subDays(new Date(), DAYS_WINDOW - 1).toISOString();
      const { data } = await supabase
        .from("pump_sessions")
        .select("pump_name, total_oz, started_at, suction_level, pump_mode")
        .eq("user_id", user.id)
        .not("pump_name", "is", null)
        .gte("started_at", since)
        .order("started_at", { ascending: true });

      const rows = (data ?? []) as SessionRow[];
      setAllRows(rows);
      if (rows.length === 0) { setNoData(true); setLoading(false); return; }

      const dayList = eachDayOfInterval({
        start: startOfDay(subDays(new Date(), DAYS_WINDOW - 1)),
        end:   startOfDay(new Date()),
      }).map((d) => format(d, "yyyy-MM-dd"));

      const { series: s, totalPoints: t } = buildSeries(rows, dayList);
      if (s.length < 2) { setNoData(true); setLoading(false); return; }

      setSeries(s);
      setTotalPts(t);
      setDays(dayList);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={{ overflow: "hidden", borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
      <LinearGradient
        colors={["#2E3F40", "#4A5E60"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 16, paddingBottom: 36, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginRight: 12 }}>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 20 }}>←</Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 20, color: "#fff" }}>Pump Comparison</Text>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 19 }}>
          Daily output per pump over the last {DAYS_WINDOW} days.
        </Text>
      </LinearGradient>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : noData ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 16 }}>📊</Text>
          <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink, textAlign: "center", marginBottom: 12 }}>
            Not enough data yet
          </Text>
          <Text style={{ fontSize: 14, color: COLORS.ink3, textAlign: "center", lineHeight: 20 }}>
            Add your pumps in Profile → My Pumps, then select which pump you used during each session. Once you have sessions logged for at least 2 pumps, your comparison will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 16 }}>

          {/* Line chart */}
          <View style={{ backgroundColor: "#fff", borderRadius: 20, paddingTop: 20, paddingBottom: 16, paddingHorizontal: 0, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2, overflow: "hidden" }}>
            <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, paddingHorizontal: 20 }}>
              Daily output · last {DAYS_WINDOW} days
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 12, paddingHorizontal: 20 }}>
              {unit === "ml" ? "ml" : "oz"} per day, by pump
            </Text>

            <LineChart
              series={series}
              totalPoints={totalPts}
              days={days}
              width={screenW - 40}
              unit={unit}
              showTotal={showTotal}
            />

            <View style={{ marginTop: 16, paddingHorizontal: 20 }}>
              <Legend
                series={series}
                totalPoints={totalPts}
                showTotal={showTotal}
                onToggleTotal={() => setShowTotal((v) => !v)}
                unit={unit}
              />
            </View>
          </View>

          {/* Per-pump summary cards */}
          {series.map((s) => {
            const activeDays = s.points.filter((p) => p.oz > 0).length;
            const convert = (oz: number) => unit === "ml" ? Math.round(ozToMl(oz)) : oz;
            const fmt = (oz: number) => unit === "ml" ? `${Math.round(ozToMl(oz))} ml` : `${oz.toFixed(1)} oz`;
            const best = s.points.reduce((a, b) => b.oz > a.oz ? b : a, s.points[0]);

            return (
              <View key={s.name} style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
                  <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, flex: 1 }}>
                    {s.name}
                  </Text>
                  <View style={{ backgroundColor: "rgba(74,94,96,0.1)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, letterSpacing: 0.5 }}>
                      {s.totalSessions} SESSIONS
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 0 }}>
                  {[
                    { label: "Avg / session", value: fmt(s.avgOz) },
                    { label: "Days used", value: String(activeDays) },
                    { label: "Best day", value: fmt(best.oz) },
                  ].map(({ label, value }, i, arr) => (
                    <View
                      key={label}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        borderRightWidth: i < arr.length - 1 ? 1 : 0,
                        borderRightColor: COLORS.border,
                      }}
                    >
                      <Text style={{ fontSize: 18, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink }}>
                        {value}
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2, textAlign: "center" }}>{label}</Text>
                    </View>
                  ))}
                </View>

                {s.totalSessions < 5 && (
                  <Text style={{ fontSize: 11, color: COLORS.amber, marginTop: 12 }}>
                    ⚠ Fewer than 5 sessions — keep logging for more reliable data
                  </Text>
                )}
              </View>
            );
          })}

          {/* Settings insight */}
          {(() => {
            const withSettings = allRows.filter((r) => r.suction_level || r.pump_mode);
            if (withSettings.length < 5) return null;

            // Best suction level
            const byLevel = new Map<number, number[]>();
            allRows.forEach((r) => {
              if (r.suction_level && r.total_oz) {
                if (!byLevel.has(r.suction_level)) byLevel.set(r.suction_level, []);
                byLevel.get(r.suction_level)!.push(r.total_oz);
              }
            });
            let bestLevel: number | null = null;
            let bestLevelAvg = 0;
            byLevel.forEach((vals, level) => {
              if (vals.length < 2) return;
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              if (avg > bestLevelAvg) { bestLevelAvg = avg; bestLevel = level; }
            });

            // Best mode
            const byMode = new Map<string, number[]>();
            allRows.forEach((r) => {
              if (r.pump_mode && r.total_oz) {
                if (!byMode.has(r.pump_mode)) byMode.set(r.pump_mode, []);
                byMode.get(r.pump_mode)!.push(r.total_oz);
              }
            });
            let bestMode: string | null = null;
            let bestModeAvg = 0;
            byMode.forEach((vals, mode) => {
              if (vals.length < 2) return;
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              if (avg > bestModeAvg) { bestModeAvg = avg; bestMode = mode; }
            });

            const modeLabel = (m: string) => m === "massage" ? "Massage" : m === "expression" ? "Expression" : "Combo";
            const fmtOz = (oz: number) => unit === "ml" ? `${Math.round(ozToMl(oz))} ml` : `${oz.toFixed(1)} oz`;

            if (!bestLevel && !bestMode) return null;

            return (
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                  ⚙ Settings insights
                </Text>
                <View style={{ gap: 10 }}>
                  {bestLevel && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(74,94,96,0.1)", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 15, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.primary }}>{bestLevel}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
                          Best suction level: {bestLevel}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                          {fmtOz(bestLevelAvg)} avg per session at this level
                        </Text>
                      </View>
                    </View>
                  )}
                  {bestMode && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(74,94,96,0.1)", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 18 }}>{bestMode === "massage" ? "💧" : bestMode === "expression" ? "🥛" : "🔄"}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
                          Best mode: {modeLabel(bestMode)}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                          {fmtOz(bestModeAvg)} avg per session in this mode
                        </Text>
                      </View>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 4, fontStyle: "italic" }}>
                    Based on {withSettings.length} sessions with settings logged
                  </Text>
                </View>
              </View>
            );
          })()}

          {/* IBCLC note */}
          <LinearGradient
            colors={["#CEC5CC", "#FDF6EE"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(176,128,144,0.2)" }}
          >
            <View style={{ padding: 18 }}>
              <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                IBCLC NOTE
              </Text>
              <Text style={{ fontSize: 13, color: "#7A5C44", lineHeight: 21 }}>
                Output differences between pumps can reflect suction pattern, flange fit, or how your body responds to each pump's rhythm. Hydration, time of day, and stress also play a role — so use this as a guide, not a verdict. If one pump consistently outperforms another, it's worth checking fit and suction settings on the lower one before swapping it out entirely.
              </Text>
              <Text style={{ fontSize: 10, color: "rgba(74,94,96,0.5)", marginTop: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", letterSpacing: 0.3 }}>
                Katie Clark, IBCLC · Pump Coach
              </Text>
            </View>
          </LinearGradient>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
