import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "../tooltip";

const meta = {
  title: "ui/tooltip",
  parameters: {
    layout: "centered",
  },
  tags: ["autodocds"],
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Example: Story = {
  args: {
    children: <span>A hoverable tooltip</span>,
    content: "Hello from Storybook!",
  },
  render: (args) => <Tooltip {...args}></Tooltip>,
};
