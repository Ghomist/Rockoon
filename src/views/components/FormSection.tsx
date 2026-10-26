import type { ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  id?: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  description?: string;
  badge?: string;
  children?: React.ReactNode;
}

export default function FormSection({
  id,
  title,
  icon: Icon,
  description,
  badge,
  children
}: Props) {
  return (
    <Card
      id={id}
      className="scroll-mt-4 gap-4 bg-card/80 py-5 backdrop-blur-[2px]"
    >
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2.5 text-[15px]">
          {Icon && (
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
          )}
          {title}
          {badge && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
        </CardTitle>
        {description && (
          <CardDescription className="break-all">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}
