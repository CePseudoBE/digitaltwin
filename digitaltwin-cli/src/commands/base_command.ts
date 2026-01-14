import { BaseCommand as AceBaseCommand } from '@adonisjs/ace'
import { StubGenerator } from '../generators/stub_generator.js'
import { ProjectDetector } from '../utils/project_detector.js'

/**
 * Base class for all CLI commands providing common functionality
 */
export abstract class BaseCommand extends AceBaseCommand {
  private _stubGenerator?: StubGenerator
  private _projectDetector?: ProjectDetector

  protected get stubGenerator(): StubGenerator {
    if (!this._stubGenerator) {
      this._stubGenerator = new StubGenerator()
    }
    return this._stubGenerator
  }

  protected get projectDetector(): ProjectDetector {
    if (!this._projectDetector) {
      this._projectDetector = new ProjectDetector()
    }
    return this._projectDetector
  }

  protected success(message: string): void {
    this.logger.success(message)
  }

  protected info(message: string): void {
    this.logger.info(message)
  }

  protected warning(message: string): void {
    this.logger.warning(message)
  }
}
