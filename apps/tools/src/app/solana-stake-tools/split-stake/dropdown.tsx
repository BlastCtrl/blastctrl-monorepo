import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptionProps,
  ListboxOptions,
  ListboxProps,
  ListboxSelectedOption,
} from "@headlessui/react";
import { Fragment, type ReactNode } from "react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";

interface DropdownProps<T>
  extends Omit<ListboxProps<typeof Fragment, T>, "as"> {
  placeholder: ReactNode;
  children: ReactNode;
}

export function Dropdown<T>({
  placeholder,
  children,
  ...props
}: DropdownProps<T>) {
  return (
    <Listbox {...props}>
      <ListboxButton className="inline-flex w-full items-center justify-between gap-x-2 rounded-lg border border-zinc-950/10 px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] text-base/6 font-medium text-zinc-950 data-[active]:bg-zinc-950/[2.5%] data-[hover]:bg-zinc-950/[2.5%] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)] sm:text-sm/6">
        <ListboxSelectedOption
          options={children}
          placeholder={<span className="opacity-50">{placeholder}</span>}
        />
        <ChevronUpDownIcon className="-mr-1 ml-2 size-4 shrink-0 text-zinc-700" />
      </ListboxButton>
      <ListboxOptions
        transition
        anchor={{ to: "bottom start", gap: 6, padding: 16 }}
        className="min-w-fit origin-top-left space-y-px rounded-lg bg-gray-50 p-0.5 text-zinc-700 shadow-xl ring-1 ring-black/10 transition duration-300 data-[closed]:-translate-y-4 data-[closed]:scale-95 data-[closed]:opacity-0"
      >
        {children}
      </ListboxOptions>
    </Listbox>
  );
}

interface DropdownOptionProps<T> extends ListboxOptionProps<"div", T> {
  children: ReactNode;
}

export function DropdownOption<T>({
  children,
  ...props
}: DropdownOptionProps<T>) {
  return (
    <ListboxOption as={Fragment} {...props}>
      {({ selectedOption }) => {
        return selectedOption ? (
          // @ts-ignore
          <>{children}</>
        ) : (
          <div className="w-full cursor-default rounded-md px-3 py-1 text-base/6 data-[selected]:bg-indigo-500 data-[selected]:text-white sm:text-sm/6 [&:not([data-selected])]:data-[focus]:bg-blue-100">
            {children}
          </div>
        );
      }}
    </ListboxOption>
  );
}
