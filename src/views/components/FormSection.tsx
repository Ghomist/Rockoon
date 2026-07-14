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
      className="scroll-mt-4 bg-card/50 backdrop-blur-[2px]"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {title}
          {badge && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
