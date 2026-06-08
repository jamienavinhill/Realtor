import React, { useMemo } from "react";
import { BarChart, LineChart } from "lucide-react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ListingProperty } from "../../types/listings";

export function CMAView({ properties }: { properties: ListingProperty[] }) {
  const activeListings = useMemo(
    () => properties.filter((property) => property.status.toLowerCase() === "active"),
    [properties],
  );

  const summary = useMemo(() => {
    const totalPrice = activeListings.reduce((sum, property) => sum + property.price, 0);
    const totalSqft = activeListings.reduce((sum, property) => sum + property.sqft, 0);

    return {
      count: activeListings.length,
      avgPrice: activeListings.length > 0 ? Math.round(totalPrice / activeListings.length) : 0,
      avgPricePerSqft: totalSqft > 0 ? Math.round(totalPrice / totalSqft) : 0,
    };
  }, [activeListings]);

  const bedroomData = useMemo(() => {
    const groups = new Map<number, ListingProperty[]>();

    activeListings.forEach((property) => {
      const bedCount = Math.floor(property.beds || 0);
      if (!groups.has(bedCount)) groups.set(bedCount, []);
      groups.get(bedCount)?.push(property);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([bedCount, listings]) => ({
        name: `${bedCount} Beds`,
        Average: Math.round(
          listings.reduce((sum, property) => sum + property.price, 0) / listings.length,
        ),
        Count: listings.length,
      }));
  }, [activeListings]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-stone-900 dark:text-white">
          Comparative Market Analysis
        </h1>
        <p className="text-sm text-stone-500">
          Real listing analytics for the current Firestore inventory. The 44224 baseline backfill
          must run before this view can show complete market coverage.
        </p>
      </div>

      {activeListings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <LineChart className="text-primary-500 mx-auto mb-4 h-8 w-8" />
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Real CMA data is not loaded yet
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-500">
            Run the provider-backed 44224 baseline backfill to populate real active listings. This
            screen will stay empty rather than show simulated prices or placeholder comparable data.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard label="Active listings" value={summary.count.toLocaleString()} />
            <MetricCard
              label="Average list price"
              value={`$${summary.avgPrice.toLocaleString()}`}
            />
            <MetricCard
              label="Average price / sqft"
              value={`$${summary.avgPricePerSqft.toLocaleString()}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <div className="mb-6 flex items-center space-x-2">
                <BarChart className="text-primary-500 h-5 w-5" />
                <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                  Average Price by Bedroom
                </h3>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart
                    data={bedroomData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#3f3f46"
                      opacity={0.2}
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `$${Number(value) / 1000}k`}
                    />
                    <Tooltip
                      cursor={{ fill: "transparent" }}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                      }}
                      formatter={(value, name) => [
                        name === "Average" ? `$${Number(value).toLocaleString()}` : value,
                        name,
                      ]}
                    />
                    <Bar
                      dataKey="Average"
                      fill="var(--primary-500)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={60}
                    />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <h3 className="mb-4 text-lg font-semibold text-stone-900 dark:text-stone-100">
                CMA Basis Data
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs text-stone-500 uppercase dark:bg-stone-950/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">Address</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 text-right font-medium">Price</th>
                      <th className="px-4 py-3 text-center font-medium">Beds</th>
                      <th className="px-4 py-3 text-right font-medium">SqFt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeListings.map((property) => (
                      <tr
                        key={property.id}
                        className="border-b border-stone-100 transition last:border-0 hover:bg-stone-50 dark:border-stone-800/60 dark:hover:bg-stone-800/50"
                      >
                        <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-200">
                          {property.address}
                        </td>
                        <td className="px-4 py-3 text-stone-500">{property.propertyType}</td>
                        <td className="text-primary-600 dark:text-primary-400 px-4 py-3 text-right font-mono font-medium">
                          ${property.price.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center text-stone-600 dark:text-stone-400">
                          {property.beds}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-stone-500">
                          {property.sqft.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">{label}</p>
      <p className="text-primary-500 mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
