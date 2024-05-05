import { PlusCircleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import type { CreateFormInputs } from "@/app/solana-nft-tools/mint/page";
import type { Control, UseFormRegister } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import { Button } from "@blastctrl/ui/button";
import { cn } from "@blastctrl/ui";

export type AttributesProps = {
  register: UseFormRegister<CreateFormInputs>;
  control: Control<CreateFormInputs, any>;
};

export const Attributes = ({ control, register }: AttributesProps) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "attributes",
    rules: {
      required: false,
    },
  });

  return (
    <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
      <div className="sm:col-span-6">
        <div className="flex flex-col gap-y-2">
          {fields.map((field, idx) => (
            <fieldset key={field.id}>
              <legend className="sr-only">Trait Type and Value</legend>
              <div className="mt-1 -space-y-px rounded-md bg-white">
                <div className="grid grid-cols-9 space-x-2">
                  <div className="col-span-4 flex-1">
                    <label htmlFor={`trait-${idx}`} className="sr-only">
                      Trait Type
                    </label>
                    <input
                      id={`trait-${idx}`}
                      type="text"
                      {...register(`attributes.${idx}.trait_type` as const, {
                        required: true,
                      })}
                      defaultValue=""
                      className={cn(
                        "relative block w-full rounded-md border-gray-300 bg-transparent pr-6",
                        "focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                      )}
                      placeholder="Trait type"
                    />
                  </div>
                  <div className="col-span-4 flex-1">
                    <label htmlFor={`value-${idx}`} className="sr-only">
                      Value
                    </label>
                    <input
                      id={`value-${idx}`}
                      type="text"
                      {...register(`attributes.${idx}.value` as const)}
                      className={cn(
                        "relative block w-full rounded-md border-gray-300 bg-transparent",
                        "focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm",
                      )}
                      placeholder="Value"
                    />
                  </div>
                  <div className="col-span-1">
                    <label htmlFor={`remove-${idx}`} className="sr-only">
                      Remove creator
                    </label>
                    <button
                      id={`remove-${idx}`}
                      className="inline-flex h-full w-full items-center justify-center rounded-md border border-transparent bg-red-500"
                      type="button"
                      onClick={() => remove(idx)}
                    >
                      <XMarkIcon className="h-5 w-5 font-semibold text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </fieldset>
          ))}
          <div className="mt-2">
            <Button
              color="indigo"
              onClick={() => append({ trait_type: "", value: "" })}
              type="button"
              className="h-10 w-full"
            >
              Add Attribute
              <PlusCircleIcon className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
