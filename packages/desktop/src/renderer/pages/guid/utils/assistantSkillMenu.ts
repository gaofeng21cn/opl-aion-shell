export type GuidSkillCatalogItem = {
  name: string;
  description: string;
  isAuto: boolean;
};

export type GuidAssistantSkillProfile = {
  required_skills: string[];
  optional_skills: string[];
};

export type GuidSkillMenuItem = GuidSkillCatalogItem & {
  required: boolean;
  locked: boolean;
};

const unique = (items: string[]): string[] => Array.from(new Set(items.filter((item) => item.trim())));

export function mergeRequiredSkills(requiredSkills: string[], selectedSkills: string[] = []): string[] {
  return unique([...requiredSkills, ...selectedSkills]);
}

export function buildAssistantScopedSkillMenuItems(
  allSkills: GuidSkillCatalogItem[],
  skillProfile: GuidAssistantSkillProfile | undefined
): GuidSkillMenuItem[] {
  if (!skillProfile) {
    return allSkills.map((skill) => ({
      ...skill,
      required: false,
      locked: false,
    }));
  }

  const catalog = new Map(allSkills.map((skill) => [skill.name, skill]));
  const required = new Set(skillProfile.required_skills);
  return unique([...skillProfile.required_skills, ...skillProfile.optional_skills]).map((skillName) => {
    const catalogItem = catalog.get(skillName);
    const isRequired = required.has(skillName);
    return {
      name: skillName,
      description: catalogItem?.description ?? '',
      isAuto: false,
      required: isRequired,
      locked: isRequired,
    };
  });
}

export function isGuidSkillChecked(
  skill: GuidSkillMenuItem,
  enabledSkills: string[],
  disabledBuiltinSkills: string[]
): boolean {
  if (skill.required) return true;
  return skill.isAuto ? !disabledBuiltinSkills.includes(skill.name) : enabledSkills.includes(skill.name);
}
