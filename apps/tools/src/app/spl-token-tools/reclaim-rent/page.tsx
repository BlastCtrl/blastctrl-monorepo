import { ReclaimRentTool } from "./_components/reclaim-rent-tool";
import { RentStatusBoundary } from "./_components/rent-status-boundary";

// How often the server reads the rent status again; see RentStatusBoundary.
export const revalidate = 300;

export default function ReclaimRentPage() {
  return (
    <RentStatusBoundary>
      <ReclaimRentTool />
    </RentStatusBoundary>
  );
}
