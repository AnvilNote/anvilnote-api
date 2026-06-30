import { type Project } from "@prisma/client";
import { HttpError } from "../../lib/http-error";
import type { CreateProjectInput, UpdateProjectInput } from "./project.schemas";
import type { ProjectRecord } from "./project.types";
import { ProjectRepository } from "./project.repository";

function mapProject(project: Project): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    icon: project.icon,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export class ProjectService {
  private readonly projectRepository = new ProjectRepository();

  async listProjects() {
    const projects = await this.projectRepository.list();
    return projects.map(mapProject);
  }

  async createProject(input: CreateProjectInput) {
    const project = await this.projectRepository.create({
      name: input.name,
      icon: input.icon,
    });

    return mapProject(project);
  }

  async updateProject(id: string, input: UpdateProjectInput) {
    await this.ensureProjectExists(id);

    const project = await this.projectRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
    });

    return mapProject(project);
  }

  async deleteProject(id: string) {
    await this.ensureProjectExists(id);
    const project = await this.projectRepository.delete(id);

    return { id: project.id };
  }

  private async ensureProjectExists(id: string) {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new HttpError(404, "Project not found");
    }
    return project;
  }
}
