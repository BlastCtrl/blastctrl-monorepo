import { AuthorizeFormsContainer } from "./authorize-forms";

export default function StakeAuthorityManagement() {
  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="font-display text-3xl font-semibold">
          Update stake account authority
        </h1>
        <p className="mt-4 text-sm text-gray-500">Only for advanced users.</p>
      </header>

      <AuthorizeFormsContainer />
    </div>
  );
}
