import { styled } from "@linaria/react";
import { KindIcon } from "../kind-icon/KindIcon";
import { flagColorVars } from "./ConsoleRow";
import { flagDescription, flagGroup, flagIcon } from "./flags";

/** Explanations of the flags being filtered by, flags without one are skipped */
export function FlagBanners({ flags }: { flags: string[] }) {
  const described = [...new Set(flags)].flatMap((flag) => {
    const description = flagDescription(flag);
    return description ? [{ flag, description }] : [];
  });
  if (described.length === 0) return null;

  return (
    <Banners>
      {described.map(({ flag, description }) => {
        const icon = flagIcon(flag);
        return (
          <Banner key={flag} data-group={flagGroup(flag)}>
            <BannerFlag>
              {icon && <KindIcon kind={icon} size={14} />}
              {flag}
            </BannerFlag>
            <span>{description}</span>
          </Banner>
        );
      })}
    </Banners>
  );
}

const Banners = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Banner = styled.div`
  --c: var(--text-dim);
  ${flagColorVars}

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--c) 35%, var(--group-border));
  border-left: 3px solid var(--c);
  border-radius: 6px;
  background: color-mix(in srgb, var(--c) 8%, var(--group));
  font-size: 14px;
  color: var(--text);
`;

const BannerFlag = styled.strong`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  color: var(--c);
`;
