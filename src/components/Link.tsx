import { forwardRef, type ComponentProps } from "react";
import { Link as RouterLink, NavLink as RouterNavLink } from "react-router";

export const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof RouterLink>>(
  (props, ref) => <RouterLink discover="none" {...props} ref={ref} />,
);

export const NavLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof RouterNavLink>>(
  (props, ref) => <RouterNavLink discover="none" {...props} ref={ref} />,
);
